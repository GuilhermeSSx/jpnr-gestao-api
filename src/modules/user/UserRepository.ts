import { pool } from '../../mysql';
import { hash, compare } from 'bcrypt';
import { sign, verify } from 'jsonwebtoken';
import { Request, Response } from 'express';

class UserRepository {
    cadastrar(request: Request, response: Response) {


        const { name, email, password } = request.body;
        pool.getConnection((err: any, connection: any) => {
            hash(password, 10, (err, hash) => {
                if (err) {
                    return response.status(500).json(err);
                }

                connection.query(
                    'INSERT INTO usuarios (name, email, password) VALUES (?,?,?)',
                    [name, email, hash],
                    (error: any, result: any, fileds: any) => {
                        connection.release();
                        if (error) {
                            return response.status(400).json(error);
                        }
                        response.status(200).json({ message: 'Usuário criado com sucesso!' });
                    }
                );
            });
        });
    }

    login(request: Request, response: Response) {
        const { email, password } = request.body;

        pool.getConnection((err: any, connection: any) => {
            if (err) {
                return response.status(500).json({ error: "Erro na sua autenticação!" });
            }

            // Defina um tempo limite para a consulta SQL em milissegundos (por exemplo, 5000 para 5 segundos)
            connection.config.queryTimeout = 5000;

            connection.query(
                'SELECT * FROM usuarios WHERE email = ?',
                [email],
                (error: any, results: any, fields: any) => {
                    connection.release();
                    if (error) {
                        return response.status(400).json({ error: "Erro na sua autenticação!" });
                    }

                    if (results.length === 0) {
                        // Usuário não encontrado, retorne uma resposta apropriada
                        return response.status(404).json({ error: "Usuário não encontrado" });
                    }

                    compare(password, results[0].password, (err, result) => {
                        if (err) {
                            return response.status(400).json({ error: "Erro na sua autenticação!" });
                        }

                        if (result) {
                            // jsonwebtoken JWT
                            const token = sign({
                                id: results[0].id,
                                name: results[0].name,
                                email: results[0].email,
                                role: results[0].role
                            }, process.env.SECRET as string, { expiresIn: "1d" })

                            const id = results[0].id;
                            const name = results[0].name;
                            const userEmail = results[0].email;
                            const role = results[0].role


                            return response.status(200).json({ id, name, userEmail, role, token: token })
                        } else {
                            // Senha incorreta
                            return response.status(401).json({ error: "Senha incorreta" });
                        }

                    });



                }
            );
        });
    }


    getUsers(request: any, response: any) {
        pool.getConnection((error: any, conn: any) => {

            conn.config.queryTimeout = 5000;

            conn.query(

                'SELECT id, name, email, role FROM usuarios order by name ASC',
                (error: any, resultado: any, fields: any) => {
                    conn.release();
                    if (error) {
                        return response.status(400).send({
                            error: error,
                            response: null
                        });
                    }

                    if (error) {
                        return response.status(400).json({ error: "Erro em carregar os usuarios!" });
                    }

                    return response.status(200).json({ usuarios: resultado })

                }
            );
        });

    }

    deleteUser(request: Request, response: Response) {
        const { id } = request.params;

        if (id == '585') {
            return response.status(401).json({ error: "Ação não autorizada, contate o administrador do sistema", id });
        }

        pool.getConnection((err: any, connection: any) => {
            connection.query(
                'DELETE FROM usuarios WHERE id = ?',
                [id],
                (error: any, result: any, fields: any) => {
                    connection.release();

                    if (error) {
                        return response.status(500).json({ error: "Erro ao deletar o usuário", id });
                    }

                    if (result.affectedRows === 0) {
                        return response.status(404).json({ error: "Usuário não encontrado" });
                    }

                    return response.status(200).json({ message: "Usuário excluído com sucesso", id });
                });
        });
    }




    getUser(request: any, response: any) {
        const decode: any = verify(request.headers.authorization, process.env.SECRET as string);
        if (decode.email) {
            pool.getConnection((error, conn) => {
                conn.query(
                    'SELECT * FROM usuarios WHERE email = ?',
                    [decode.email],
                    (error, resultado, fileds) => {
                        conn.release();
                        if (error) {
                            return response.status(400).send({
                                error: error,
                                response: null
                            });
                        }

                        console.log(resultado);

                        return response.status(201).send({
                            usuarios: {
                                name: resultado[0].name,
                                email: resultado[0].email,
                                id: resultado[0].id,
                            }
                        });
                    }
                );
            });
        }
    }

    // --> Perfil de Acesso
    //Necessário refatorar ou fazer por meio de stored procedure

    criarPerfilAcesso(request: Request, response: Response) {
        const { nome_perfil_acesso } = request.body;

        pool.getConnection((err: any, connection: any) => {

            connection.config.queryTimeout = 30000;

            if (err) {
                return response.status(500).json(err);
            }

            // Inicie uma transação para garantir a consistência dos dados em todas as tabelas
            connection.beginTransaction(async (error: any) => {
                if (error) {
                    return response.status(400).json(error);
                }

                let perfilAcessoId: number;
                let idModulo: number;

                // Insira o novo perfil de acesso
                connection.query(
                    'INSERT INTO perfil_acesso (nome_perfil_acesso) VALUES (?)',
                    [nome_perfil_acesso],
                    (insertError: any, result: any, fields: any) => {
                        if (insertError) {
                            connection.rollback(() => {
                                return response.status(400).json(insertError);
                            });
                            return;
                        }

                        // Após inserir o perfil de acesso, obtenha o ID gerado
                        perfilAcessoId = result.insertId;

                        // Insira um registro na tabela modulos_acesso
                        connection.query(
                            'INSERT INTO modulos_acesso (perfil_acesso_id, id_modulo, nome_modulo) VALUES (?, ?, ?)',
                            [perfilAcessoId, 1, 'Cadastros'],
                            (modulosError: any, modulosResult: any, modulosFields: any) => {
                                if (modulosError) {
                                    connection.rollback(() => {
                                        return response.status(400).json(modulosError);
                                    });
                                    return;
                                }

                                // Obtenha o ID gerado para modulos_acesso
                                idModulo = modulosResult.insertId;
                                console.log(idModulo);

                                // Insira um registro na tabela funcionalidades_acesso
                                connection.query(
                                    'INSERT INTO funcionalidades_acesso (perfil_acesso_id, id_modulo, nome_funcionalidade) VALUES (?, ?, ?)',
                                    [perfilAcessoId, idModulo, 'Entrada'],
                                    (funcionalidadesError: any, funcionalidadesResult: any, funcionalidadesFields: any) => {
                                        if (funcionalidadesError) {
                                            connection.rollback(() => {
                                                return response.status(400).json(funcionalidadesError);
                                            });
                                            return;
                                        }

                                        // Se todas as inserções foram bem-sucedidas, confirme a transação
                                        connection.commit((commitError: any) => {
                                            if (commitError) {
                                                connection.rollback(() => {
                                                    return response.status(400).json(commitError);
                                                });
                                                return;
                                            }

                                            response.status(200).json({ message: 'Perfil de Acesso criado com sucesso!' });
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            });
        });
    }








}

export { UserRepository };
