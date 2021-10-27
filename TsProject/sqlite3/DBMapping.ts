import { ClassMetadata, FieldMetadata } from "./utils/Decorator";
import { DBConnection } from "./DBConnection";
import { DBCommandInsert } from "./DBCommandInsert";
import { DBColumn } from "./DBColumn";
import {
    Table,
    Column,
    PrimaryKey,
    AutoInc,
    Unique,
    NotNull,
    DefaultValue,
    MaxLength
} from "./utils/Attributes";
import { DBType } from "./DBType";

type Type<T> = { new(...args: any[]): T };

/**数据表映射信息 */
class DBMapping {
    /**表对应的js原型 proto */
    public Type: Type<object>;
    /**数据表名称 */
    public tableName: string;
    /**主键 */
    public pk: DBColumn;
    /**字段信息 */
    public columns: DBColumn[];
    /**通过主键查询 */
    public getByPrimaryKeySql: string;
    //插入命令行
    private _insertCommand: DBCommandInsert;
    private _insertCommandExtra: string;
    /**字段信息 */
    private _insertColumns: DBColumn[];
    private _insertOrReplaceColumns: DBColumn[];
    public get insertColumns(): DBColumn[] {
        if (!this._insertColumns) {
            this._insertColumns = new Array();
            this.columns.forEach(col => {
                if (!col.autoInc) this._insertColumns.push(col);
            });
        }
        return this._insertColumns;
    }
    public get insertOrReplaceColumns(): DBColumn[] {
        if (!this._insertOrReplaceColumns) {
            this._insertOrReplaceColumns = new Array();
            this.columns.forEach(col => this._insertOrReplaceColumns.push(col));
        }
        return this._insertOrReplaceColumns;
    }

    constructor(type: Type<object>) {
        this.Type = type;
        //数据表名称
        let name: string = ClassMetadata.getFirst(type, Table)?.info ?? type.name;
        this.tableName = name;
        //获取字段信息
        this.columns = new Array();
        for (let key of FieldMetadata.getFields(type, true)) {
            let conf = FieldMetadata.getFirst(type, key, Column, true)?.info as { type: DBType, alias: string };
            if (!conf)
                continue;

            let pk: boolean = !!FieldMetadata.getFirst(type, key, PrimaryKey, true);
            let autoInc: boolean = pk && !!FieldMetadata.getFirst(type, key, AutoInc, true);
            let unique: boolean = !!FieldMetadata.getFirst(type, key, Unique, true);
            let notNull: boolean = !!FieldMetadata.getFirst(type, key, NotNull, true);
            let value: boolean = FieldMetadata.getFirst(type, key, DefaultValue, true)?.info;
            let len: number = FieldMetadata.getFirst(type, key, MaxLength, true)?.info;

            let col = new DBColumn({
                prop: key,
                propType: conf.type,
                name: conf.alias ?? key,
                pk: pk,
                autoInc: autoInc,
                unique: unique,
                notNull: notNull,
                defaultValue: value,
                maxLength: len,
            });

            this.columns.push(col);
            if (col.pk) this.pk = col;
        }
        if (this.columns.length <= 0)
            throw new Error(`数据表${type.name}(${this.tableName}), 没有有效字段`);

        let info = "";
        this.columns.forEach(col => info += "\n" + JSON.stringify(col));
        //console.log(`DBMapping: ${this.tableName}:${info}`);
        //PK
        if (this.pk)
            this.getByPrimaryKeySql = `SELECT * FROM "${this.tableName}" WHERE "${this.pk.name}" = ?`;
        else
            this.getByPrimaryKeySql = `SELECT * FROM "${this.tableName}" LIMIT 1`;
    }
    public findColumn(name: string): DBColumn {
        for (let i = 0; i < this.columns.length; i++) {
            if (this.columns[i].name == name)
                return this.columns[i];
        }
        return null;
    }
    public findColumnByPorpertyName(name: string): DBColumn {
        for (let i = 0; i < this.columns.length; i++) {
            if (this.columns[i].prop == name)
                return this.columns[i];
        }
        return null;
    }
    public dispose() {
        if (this._insertCommand)
            this._insertCommand.dispose();
    }
    public getInsertCommand(conn: DBConnection, extra: string) {
        if (!this._insertCommand) {
            this._insertCommand = this.createInsertCommand(conn, extra);
            this._insertCommandExtra = extra;
        }
        else if (!this._insertCommand.isConnect(conn) || this._insertCommandExtra != extra) {
            this._insertCommand.dispose();
            this._insertCommand = this.createInsertCommand(conn, extra);
            this._insertCommandExtra = extra;
        }
        return this._insertCommand;
    }
    public createInsertCommand(conn: DBConnection, extra: string) {
        let insertSql = "";
        let cols = this.insertColumns;
        if (cols.length == 1 && cols[0].autoInc) {
            insertSql = `INSERT ${this.tableName} INTO "${extra}" DEFAULT VALUES`
        }
        else {
            if (extra === "OR REPLACE") cols = this.insertOrReplaceColumns;
            let names = new Array<string>(), vals = new Array<string>();
            for (let col of cols) {
                names.push("\"" + col.name + "\"");
                vals.push("?");
            }
            insertSql = `INSERT ${extra} INTO "${this.tableName}"(${names.join(",")}) VALUES (${vals.join(",")})`
        }
        let cmd = new DBCommandInsert(conn);
        cmd.commandText = insertSql;
        return cmd;
    }
    public createInstance() {
        return new (this.Type)();
    }
}

export { DBMapping };